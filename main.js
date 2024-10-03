let authKey = localStorage.getItem('authKey')
let serverAuthKey, clientAuthKey

let socket;
let waitingForAuth = true

document.addEventListener('DOMContentLoaded', ()=>{
	if(!authKey){
		authKey = window.location.hash.substring(1)
		console.log(authKey)
		window.location.hash = ''
		if(authKey){
			localStorage.setItem('authKey', authKey)
			;[serverAuthKey, clientAuthKey] = authKey.split('_')
			openWebsocket()
			loadApp()
		}else{
			document.body.textContent = 'ERROR - NO AUTH'
		}
	}else{
		;[serverAuthKey, clientAuthKey] = authKey.split('_')
		openWebsocket()
		loadApp()
	}
})
function openWebsocket(){

	socket = new WebSocket("wss://alienterrarium.ca/dictation-app-wss/");
	socket.addEventListener("open", (event) => {
	  socket.send(clientAuthKey)
	});
	socket.addEventListener("message", (event) => {
		if(waitingForAuth){
			if(event.data === serverAuthKey){
				waitingForAuth = false
				console.log('got pipe auth')

				listenForTaskAppFromServer()
				return
			}
		}
	  	event.data.arrayBuffer().then(arrayBuf => {
			//const dataArr = new Uint8Array(arrayBuf)
			handleMessageFromServer(arrayBuf)
			console.log("Message from server ", arrayBuf);
		})
	});
	socket.addEventListener("error", (event) => {
		console.log('local socket error: ', event)
	});
	socket.addEventListener("close", (event) => {
		setTimeout(openWebsocket, 100)
	});
}

function handleMessageFromServer(data){
	const dv = new DataView(data)
	const type = dv.getUint8(0)
	if(type === 1){//VirtualFileUpdate
		const metadataLen = dv.getUint32(1)
		const dataLen = dv.getUint32(1+4)
		const metadataBuf = data.slice(1+4+4, 1+4+4+metadataLen)
		const dataBuf = data.slice(1+4+4+metadataLen, 1+4+4+metadataLen+dataLen)
		const td = new TextDecoder()
		const metadata = JSON.parse(td.decode(metadataBuf))
		handleVirtualFileUpdate(metadata, dataBuf)
	}
}


//oooo

function handleVirtualFileUpdate(metadata, dataBuf){
	if(metadata.path === 'task-app.html'){
		const td = new TextDecoder()
		const str = td.decode(dataBuf)
		console.log(str)
		console.log('TODO - got task-app.html virtual file update')
	}
}

function listenForTaskAppFromServer(){

	const enc = new TextEncoder();
	const header = enc.encode('task-app.html');
	const lenTemp = new ArrayBuffer(4)
	const dv = new DataView(lenTemp)
	dv.setUint32(0, header.length)
	const full = new Uint8Array(1+4+header.length)
	full[0] = 2;//2=SubscribeToVirtualFile
	full.set(new Uint8Array(lenTemp), 1)
	full.set(header, 1+4)
	socket.send(full)
}

function sendAudioToServer(mimetype, data){
	console.log(mimetype, data.byteLength)

	if(!mimetype.startsWith('audio/webm')){
		console.log('todo support: ' + mimetype)
		return
	}
	const timestamp = Date.now()

	const filename = 'dictation_audio_segment_'+timestamp+'.webm'
	const tags = ['dictation', 'audio', 'for-stt']

	if(waitingForAuth || socket.readyState !== WebSocket.OPEN){
		console.log('todo queue until auth - for now, discarded msg')
		return
	}
	const enc = new TextEncoder();
	const header = enc.encode((JSON.stringify({type: 'file', tags: tags, name: filename, mimetype: mimetype})));
	const lenTemp = new ArrayBuffer(4)
	const dv = new DataView(lenTemp)
	dv.setUint32(0, header.length)
	data = new Uint8Array(data)
	const full = new Uint8Array(1+4+header.length + data.length)
	full[0] = 1;//1=SaveFile
	full.set(new Uint8Array(lenTemp), 1)
	full.set(header, 1+4)
	full.set(data, 1+4 + header.length)
	console.log(data)
	socket.send(full)
}

let currentRecorder
let recordingStarted = false
function loadApp(){
	const b = document.getElementById('dictation-button');
	b.addEventListener('mousedown', ()=> {
		if(recordingStarted) {console.log('already speaking'); return}
		startRecorder()
	})
	document.addEventListener('mouseup', ()=> {
		console.log('mouseup')
		stopRecorder()
	})
	b.addEventListener('touchstart', ()=> {
		console.log('touchstart')
		if(recordingStarted) {console.log('already speaking'); return}
		startRecorder()
	})
	document.addEventListener('touchend', ()=> {
		console.log('touchend')
		stopRecorder()
	})
}

function stopRecorder(){
	if(!recordingStarted){
		return
	}
	if(currentRecorder){
		currentRecorder.finish()
	}else{
		document.getElementById('status').textContent = 'stopped fast'
	}
	recordingStarted = false
}
function startRecorder(){
	recordingStarted = true

	navigator.mediaDevices.getUserMedia({
		audio: true,
		video: false,
	})
	.then(stream => {
		if(!recordingStarted){
			return
		}
		const recorder = new MediaRecorder(stream);
		recorder.ondataavailable = async(e) => {
			if (stream.active) {
				try {
					const blobURL = URL.createObjectURL(e.data);
					const request = await fetch(blobURL);
					const ab = await request.arrayBuffer();
					if(ab.byteLength > 0){
						console.log(blobURL, ab);
						sendAudioToServer(e.data.type, ab)
					}else{
						console.log('discarding empty sound clip')
					}

					stream.getTracks().forEach(function(track) {
						track.stop();
					});
				} catch (err) {
					throw err
				}
			}
		}
		currentRecorder = {
			finish(){
				document.getElementById('status').textContent = 'stopped recorder'
				recorder.stop();
				currentRecorder = undefined;
			}
		}
		recorder.start()
		document.getElementById('status').textContent = 'recording'
	})
	.catch(console.error);
}