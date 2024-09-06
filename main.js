
function arrayMax(arr) {
    return arr.reduce(function (p, v) {
      return ( p > v ? p : v );
    });
  }
function detectSilence(
    stream,
    onSoundEnd = _=>{},
    onSoundStart = _=>{},
    silence_delay = 500,
    min_decibels = -80
    ) {
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
      console.log(data)
      if (data.some(v => v)) { // if there is data above the given db limit
        if(triggered){
          triggered = false;
          onSoundStart();
          }
        silence_start = time; // set it to now
      }
      if (!triggered && time - silence_start > silence_delay) {
        onSoundEnd();
        triggered = true;
      }
    }
    loop();
  }
  
  function onSilence() {
    console.log('silence');
  }
  function onSpeak() {
    console.log('speaking');
  }
  
  navigator.mediaDevices.getUserMedia({
      audio: true
    })
    .then(stream => {
      detectSilence(stream, onSilence, onSpeak);
      // do something else with the stream
    })
    .catch(console.error);