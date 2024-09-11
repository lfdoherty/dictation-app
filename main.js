const silenceDelay = 2000;


const serverAuthKey = 'dfb0f59e-8f80-4329-9fcb-d1e90a6a7834--8bbcd38b-884b-4db2-bacd-ce5a9e70ea23'
const clientAuthKey = '0d5d996e-7191-4651-bf03-0d1d166f05b6'
let localSocket;
let waitingForAuth = true
openWebsocket()

function openWebsocket(){

	//localSocket = new WebSocket("ws://192.168.8.100:5478");
	localSocket = new WebSocket("wss://alienterrarium.ca/dictation-app-wss/");
	localSocket.addEventListener("open", (event) => {
	  //socket.send("Hello Server!");
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
	localSocket.addEventListener("ping", (event) => {
		//setTimeout(openWebsocket, 100)
	});
}

setInterval(function(){
	
}, 2000)
/*
function arrayMax(arr) {
	return arr.reduce(function (p, v) {
		return ( p > v ? p : v );
	});
	}
function detectSilence(
	stream,
	onSoundEnd = _=>{},
	onSoundStart = _=>{},
	) {
	let min_decibels = (parseInt(document.getElementById('min-decibels').value)||-40)
	document.getElementById('min-decibels').addEventListener('keyup', () => {
		min_decibels = (parseInt(document.getElementById('min-decibels').value)||-40)
		console.log('min-decibels: ' + min_decibels)
		if(min_decibels < -30){
			analyser.minDecibels = min_decibels;
		}
	})
	const ctx = new AudioContext();
	const analyser = ctx.createAnalyser();
	const streamNode = ctx.createMediaStreamSource(stream);
	streamNode.connect(analyser);
	analyser.minDecibels = min_decibels;
	
	const data = new Uint8Array(analyser.frequencyBinCount); // will hold our data
	let silence_start = performance.now();
	let triggered = false; // trigger only once per silence event
	
	function loop(time) {
		requestAnimationFrame(loop); // we'll loop every 60th of a second to check
		analyser.getByteFrequencyData(data); // get current data
		///console.log(data)
		if (data.some(v => v)) { // if there is data above the given db limit
		if(triggered){
			triggered = false;
			onSoundStart();
			}
		silence_start = time; // set it to now
		}
		if (!triggered && time - silence_start > silenceDelay) {
		onSoundEnd();
		triggered = true;
		}
	}
	loop();
}
*/
async function sendAudioToServer(mimetype, data){
	console.log(mimetype, data.byteLength)
	//just do generic data logging - we have some user-created data, with a format, and some metadata about its creation time and purpose
	if(!mimetype.startsWith('audio/webm')){
		console.log('todo support: ' + mimetype)
		return
	}
	const timestamp = Date.now()

	const filename = 'dictation_audio_segment_'+timestamp+'.webm'
	const tags = ['dictation', 'audio', 'for-stt']

	/*const response = await fetch("http://192.168.8.100", {
		method: "POST",
		body: JSON.stringify({ username: "example" }),
	});*/
	//console.log(localSocket.readyState)
	if(waitingForAuth || localSocket.readyState !== WebSocket.OPEN){
		console.log('todo queue until auth - for now, discarded msg')
		return
	}
	const enc = new TextEncoder(); // always utf-8
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
	//localSocket.send(data)
}


navigator.mediaDevices.getUserMedia({
	audio: true
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
					// recognition.onresult = handleResult;
				// URL.revokeObjectURL(blobURL);
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
	b.addEventListener('touchdown', ()=> {
		console.log('down')
		onSpeak()
	})
	document.addEventListener('touchup', ()=> {
		console.log('up')
		onSilence()
	})
	///detectSilence(stream, onSilence, onSpeak);
	//recorder.start()
	// do something else with the stream
})
.catch(console.error);