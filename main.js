const silenceDelay = 2000;

let authKey = localStorage.getItem('authKey')
let serverAuthKey, clientAuthKey

let localSocket;
let waitingForAuth = true

document.addEventListener('DOMContentLoaded', ()=>{
	if(!authKey){
		/*const authKeyEntry = document.getElementById('auth-key-entry');
		authKeyEntry.style.display = 'block'
		authKeyEntryDoneButton = document.getElementById('auth-key-entry-done-button');
		authKeyEntryDoneButton.addEventListener('click', () => {
			authKey = document.getElementById('auth-key-entry-box').value;
			localStorage.setItem('authKey', authKey)
			;[serverAuthKey, clientAuthKey] = authKey.split(':')
			openWebsocket()
		})*/
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

	localSocket = new WebSocket("wss://alienterrarium.ca/dictation-app-wss/");
	localSocket.addEventListener("open", (event) => {
	  localSocket.send(clientAuthKey)
	});
	localSocket.addEventListener("message", (event) => {
	  if(waitingForAuth){
		if(event.data === serverAuthKey){
			waitingForAuth = false
			console.log('got pipe auth')
			return
		}
	  }
	  console.log("Message from server ", event.data);
	});
	localSocket.addEventListener("error", (event) => {
		console.log('local socket error: ', event)
	});
	localSocket.addEventListener("close", (event) => {
		setTimeout(openWebsocket, 100)
	});
}

setInterval(function(){
	
}, 2000)

async function sendAudioToServer(mimetype, data){
	console.log(mimetype, data.byteLength)

	if(!mimetype.startsWith('audio/webm')){
		console.log('todo support: ' + mimetype)
		return
	}
	const timestamp = Date.now()

	const filename = 'dictation_audio_segment_'+timestamp+'.webm'
	const tags = ['dictation', 'audio', 'for-stt']

	if(waitingForAuth || localSocket.readyState !== WebSocket.OPEN){
		console.log('todo queue until auth - for now, discarded msg')
		return
	}
	const enc = new TextEncoder();
	const header = enc.encode((JSON.stringify({type: 'file', tags: tags, name: filename, mimetype: mimetype})));
	const lenTemp = new ArrayBuffer(4)
	const dv = new DataView(lenTemp)
	dv.setUint32(0, header.length)
	data = new Uint8Array(data)
	const full = new Uint8Array(4+header.length + data.length)
	full.set(new Uint8Array(lenTemp))
	full.set(header, 4)
	full.set(data, 4 + header.length)
	console.log(data)
	localSocket.send(full)
}

let currentRecorder
function loadApp(){
	const b = document.getElementById('dictation-button');
	b.addEventListener('mousedown', ()=> {
		//console.log('down')
		//onSpeak()
		startRecorder()
	})
	document.addEventListener('mouseup', ()=> {
		console.log('up')
		if(currentRecorder) currentRecorder.finish()//onSilence()
	})
	b.addEventListener('touchstart', ()=> {
		console.log('touchstart')
		//onSpeak()
		startRecorder()
	})
	document.addEventListener('touchend', ()=> {
		console.log('touchend')
		if(currentRecorder) currentRecorder.finish()
		//onSilence()
	})
}

function startRecorder(){
	navigator.mediaDevices.getUserMedia({
		audio: true,
		video: false,
	})
	.then(stream => {
		const recorder = new MediaRecorder(stream);
		recorder.ondataavailable = async(e) => {
			if (stream.active) {
				try {
					const blobURL = URL.createObjectURL(e.data);
					const request = await fetch(blobURL);
					const ab = await request.arrayBuffer();
					console.log(blobURL, ab);
					sendAudioToServer(e.data.type, ab)

					stream.getTracks().forEach(function(track) {
						track.stop();
					});
				} catch (err) {
					throw err
				}
			}
			}
		/*function onSilence() {
			//console.log('silence');
			
		}
		function onSpeak() {
			//console.log('speaking');
			
		}*/
		currentRecorder = {
			finish(){
				document.getElementById('status').textContent = 'silence'
				recorder.stop();
			}
		}
		recorder.start()
		document.getElementById('status').textContent = 'recording'
	})
	.catch(console.error);
}