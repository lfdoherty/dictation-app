const silenceDelay = 2000;


const serverAuthKey = 'dfb0f59e-8f80-4329-9fcb-d1e90a6a7834--8bbcd38b-884b-4db2-bacd-ce5a9e70ea23'
const clientAuthKey = '0d5d996e-7191-4651-bf03-0d1d166f05b6'
let localSocket;
let waitingForAuth = true
openWebsocket()

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
			} catch (err) {
				throw err
			}
		}
		}
	function onSilence() {
		//console.log('silence');
		document.getElementById('status').textContent = 'silence'
		recorder.stop();
	}
	function onSpeak() {
		//console.log('speaking');
		document.getElementById('status').textContent = 'speaking'
		recorder.start()
	}
	const b = document.getElementById('dictation-button');
	b.addEventListener('mousedown', ()=> {
		console.log('down')
		onSpeak()
	})
	document.addEventListener('mouseup', ()=> {
		console.log('up')
		onSilence()
	})
	b.addEventListener('touchstart', ()=> {
		console.log('touchstart')
		onSpeak()
	})
	document.addEventListener('touchend', ()=> {
		console.log('touchend')
		onSilence()
	})
})
.catch(console.error);