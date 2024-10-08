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

const filesBeingSaved = []//TODO should this just be messagesBeingSent? all messages idempotent anyway?

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

				if(filesBeingSaved.length > 0){
					filesBeingSaved.forEach(f => {
						socket.send(f.msg)
					})
					console.log('re-sent ' + filesBeingSaved.length + ' file(s) with new websocket')
				}

				return
			}
		}
	  	event.data.arrayBuffer().then(arrayBuf => {
			handleMessageFromServer(arrayBuf)
			console.log("Message from server ", arrayBuf);
		})
	});
	socket.addEventListener("error", (event) => {
		console.log('local socket error: ', event)
	});
	socket.addEventListener("close", (event) => {
		waitingForAuth = true
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
	}else if(type === 3){//file save ack
		const fi = filesBeingSaved.find(v => {
			return v.hash.every((vv, i) => {
				vv === data[i]
			})
		})
		if(fi === -1){
			console.log('got file save ack for unknown file')
		}else{
			filesBeingSaved.splice(fi, 1)
			console.log('got file save ack, ' + filesBeingSaved.length + ' unacked saves remaining.')
		}
	}
}


const taskAppFiles = new Map()
function gotAllTaskAppFiles(){
	return taskAppFiles.size === 4;
}
function handleVirtualFileUpdate(metadata, dataBuf){
	if(metadata.path.startsWith('task-app.')){
		const td = new TextDecoder()
		const str = td.decode(dataBuf)
		taskAppFiles.set(metadata.path, str)
	}
	if(gotAllTaskAppFiles()){
		document.getElementById('app-body').innerHTML = taskAppFiles.get('task-app.html')
		const jsTag = document.createElement("script");
		jsTag.id = 'task-app-js'
		const jsFile = new File([taskAppFiles.get('task-app.js')], "task-app.js", {
			type: "application/javascript",
		});
		const jsUrl = URL.createObjectURL(jsFile)
		console.log(jsUrl)
		jsTag.src = jsUrl
		jsTag.download = 'task-app.js'
		document.head.appendChild(jsTag);

		
		//just for ease of debugging
		const jsonTag = document.createElement("script");
		jsonTag.id = 'task-app-json'
		const jsonFile = new File([taskAppFiles.get('task-app.json')], "task-app.json", {
			type: "application/json",
		});
		const jsonUrl = URL.createObjectURL(jsonFile)
		console.log(jsonUrl)
		jsonTag.src = jsonUrl
		document.head.appendChild(jsonTag);

		const cssTag = document.createElement("link");
		cssTag.rel = 'stylesheet'
		cssTag.id = 'task-app-css'
		const cssFile = new File([taskAppFiles.get('task-app.css')], "task-app.css", {
			type: "text/css",
		});
		const cssUrl = URL.createObjectURL(cssFile)
		console.log(cssUrl)
		cssTag.href = cssUrl
		document.head.appendChild(cssTag);
		
		jsTag.onload = function(){
			loadTaskApp(JSON.parse(taskAppFiles.get('task-app.json')), saveFile)
		}
	}
}

function uint8ArrayAsHex(arr){
	return [...arr].map(x => x.toString(16).padStart(2, '0')).join('')
}
async function saveFile(metadata, dataBuf=new Uint8Array(0), maybeHash=null){
	const enc = new TextEncoder();
	const header = enc.encode((JSON.stringify(metadata)));
	const lenTemp = new ArrayBuffer(4)
	const dv = new DataView(lenTemp)
	dv.setUint32(0, header.length)
	dataBuf = new Uint8Array(dataBuf)
	const full = new Uint8Array(1+4+header.length + dataBuf.length)
	full[0] = 1;//1=SaveFile
	full.set(new Uint8Array(lenTemp), 1)
	full.set(header, 1+4)
	full.set(dataBuf, 1+4 + header.length)

	const hash = maybeHash?maybeHash:(new Uint8Array(await window.crypto.subtle.digest("SHA-256", full)));
	filesBeingSaved.push({msg: full, hash: hash})

	if(!waitingForAuth){
		console.log('sent save file: ' + JSON.stringify(metadata) + ' ' + dataBuf.length + ' ' + uint8ArrayAsHex(hash))
		socket.send(full)
	}else{
		console.log('added save file to filesBeingSaved for later: ' + JSON.stringify(metadata) + ' ' + dataBuf.length + ' ' + uint8ArrayAsHex(hash))
		//once auth is received, filesBeingSaved will be re-sent
	}
}
function listenForTaskAppFromServer(){

	function subscribeToFile(name){
		const enc = new TextEncoder();
		const header = enc.encode(name);
		const lenTemp = new ArrayBuffer(4)
		const dv = new DataView(lenTemp)
		dv.setUint32(0, header.length)
		const full = new Uint8Array(1+4+header.length)
		full[0] = 2;//2=SubscribeToVirtualFile
		full.set(new Uint8Array(lenTemp), 1)
		full.set(header, 1+4)
		socket.send(full)
	}
	subscribeToFile('task-app.html')
	subscribeToFile('task-app.js')
	subscribeToFile('task-app.css')
	subscribeToFile('task-app.json')
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
	saveFile({type: 'file', tags: tags, name: filename, mimetype: mimetype}, data)
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
		//document.getElementById('status').textContent = 'stopped fast'
	}
	recordingStarted = false
	document.getElementById('dictation-button').classList.remove('recording')
}
function startRecorder(){
	recordingStarted = true

	document.getElementById('dictation-button').classList.add('recording')

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
				//document.getElementById('status').textContent = 'stopped recorder'
				recorder.stop();
				currentRecorder = undefined;
			}
		}
		recorder.start()
		//document.getElementById('status').textContent = 'recording'
	})
	.catch(console.error);
}