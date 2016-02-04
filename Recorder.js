navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
AudioContext = AudioContext || mozAudioContext || webkitAudioContext;

function Recorder(place, config, translations) {
	this.config = {
		lang: 'en-US',
		width: 350,
		height: 100
	};
	
	this.translations = {
		'en-US': {
			'RECORDER.START_RECORD': 'Start recording',
			'RECORDER.STOP_RECORD': 'Stop recording',
			'RECORDER.RECORDED_SOUNDS_LABEL': 'Recorded sounds:',
			'RECORDER.SILENCE': 'Silence',
			'RECORDER.RECORDING': 'Recording'
		},
		'fi-FI': {
			'RECORDER.START_RECORD': 'Aloita tallennus',
			'RECORDER.STOP_RECORD': 'Lopeta tallennus',
			'RECORDER.RECORDED_SOUNDS_LABEL': 'Tallennetut äänet:',
			'RECORDER.SILENCE': 'Hiljaisuus',
			'RECORDER.RECORDING': 'Tallentaa'
		}
	}

	this.initialize(place, config, translations);
}

Recorder.prototype.initialize = function(place, config, translations) {

	this.place = place;
	for (var item in config) this.config[item] = config[item];
	for (var item in translations) this.translations[item] = translations[item];

	this.recording = false;
	this.recorded = new Array();
	
	this.canvas = null;
	this.ctx = null;
	this.javascriptNode = null;
	this.mediaStreamSource = null;
	this.context = null;
	this.sampleSize = null;
	this.silenceCounter = null;
	this.openStreams = new Array();
	//this.downloadFile;
	
	this.draw();
}

Recorder.prototype.downloadFile = (function () {
	return function (loc, f) {
		var a = document.createElement("a");
		
		var url = window.URL.createObjectURL(f);
		a.href = url;
		a.download = f.name;
		a.innerHTML = f.name;
		loc.append(a);
	};
}());

Recorder.prototype.draw = function() {
	var self = this;
	this.place
		.empty()
		.append(
			'<canvas class="waveform" style="border: 1px solid black;"></canvas><br/>' +
			'<div class="start button">' + this.translations[this.config['lang']]['RECORDER.START_RECORD'] + '</div>' +
			'<div class="stop button">' + this.translations[this.config['lang']]['RECORDER.STOP_RECORD'] + '</div>' +
			'<div class="status"></div>' +
			'<div class="recordlist">' + this.translations[this.config['lang']]['RECORDER.RECORDED_SOUNDS_LABEL'] + '<br/></div>'
		);
	
	this.canvas = this.place.find('canvas.waveform')[0];
	this.canvas.width = this.config.width;
	this.canvas.height = this.config.height;
	this.ctx = this.canvas.getContext('2d');
				
	
	this.place.find('.start.button').on('click', function(ev) {
		self.startRecord();
	});
	
	this.place.find('.stop.button').on('click', function(ev) {
		self.stopRecord();
	});
}

Recorder.prototype.errorCallback = function(e) {
	console.log('Rejected', e);
};

Recorder.prototype.__canvasDrawLine = function(oPosX, oPosY, fPosX, fPosY) {
	this.ctx.beginPath();
	this.ctx.moveTo(oPosX, oPosY);
	this.ctx.lineTo(fPosX, fPosY);
	this.ctx.stroke();
}

Recorder.prototype.__Float32Concat = function(first, second) {
	var firstLength = first.length,
		result = new Float32Array(firstLength + second.length);

	result.set(first);
	result.set(second, firstLength);

	return result;
}

Recorder.prototype.playSound = function(index) {
	var out = new AudioContext();
	
	var current = this.recorded[index].content,
		bufferSize = current.length,
		noiseBuffer = out.createBuffer(1, bufferSize, out.sampleRate),
		output = noiseBuffer.getChannelData(0);
	
	for (var i = 0; i < bufferSize; i++) {
		output[i] = current[i];
	}

	var sound = out.createBufferSource();
	sound.buffer = noiseBuffer;
	sound.loop = false;
	sound.start(0);

	sound.connect(out.destination);
}

Recorder.prototype.__processBuffer = function(e) {
	var self = this;
	var micData = e.inputBuffer.getChannelData(0);
	
	var max = Number.MIN_VALUE;
	
	for(var i = 0; i < this.sampleSize; i++) {
		max = Math.max(max, Math.abs(micData[i]));
	}
	if (max > 0.1) this.silenceCounter = 0; else ++this.silenceCounter;
	
	if (this.silenceCounter < 40) {
		if (!this.recording) {
			this.recorded.push(
				{
					content: new Float32Array(0),
					sampleRate: this.context.sampleRate,
					index: this.recorded.length
				}
			);
			document.querySelector('.status').innerHTML = this.translations[this.config['lang']]['RECORDER.RECORDING'];
			this.recording = true;
		}
		
		this.recorded[this.recorded.length - 1].content = this.__Float32Concat(this.recorded[this.recorded.length - 1].content, micData);
	}
	else {
		if (this.recording) {
			document.querySelector('.status').innerHTML =  'Silence';
			this.recording = false;
			var index = this.recorded.length - 1;
			this.place.find('.recordlist').append('<div class="item" data-item-index="' + index + '"><span class="dlLink"></span></div>');
			
			this.downloadFile(this.place.find('.recordlist .item[data-item-index="' + index + '"] .dlLink'), this.encodeArrayToMP3(this.recorded[index], index + '.mp3'));
			
			this.place.find('.recordlist .item[data-item-index="' + index + '"]').on('click', function (ev) {
				var index = $(ev.currentTarget).attr('data-item-index') | 0;
				self.playSound(index);
			});
		}
	}
	
	// draw samples values in green
	this.ctx.strokeStyle='#00a0ff';
	this.ctx.fillStyle='#000000';
	this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
	
	this.__canvasDrawLine(0, this.canvas.height / 2, this.sampleSize, this.canvas.height / 2);
	var gain = 0.25 * this.canvas.height;
	var jump = this.sampleSize / (this.canvas.width / 2);
	for(var i = 0; i < this.canvas.width / 2; ++i) {
		var val = micData[(i * jump) | 0] * gain; // combine two samples and multiply by gain
		this.__canvasDrawLine(2 * i, this.canvas.height / 2, 2 * i, this.canvas.height / 2 - val);
	}
}

Recorder.prototype.startRecord = function() {
	var self = this;
	
	if (!!navigator.getUserMedia) {
		console.log('ok, voi jatkaa');
		// Not showing vendor prefixes.
		navigator.getUserMedia(
			{
				video: false,
				audio: true,
				googAutoGainControl: false
			},
			function(stream) {
				self.sampleSize = 1024;
				
				self.silenceCounter = 1000;
				document.querySelector('.status').innerHTML =  self.translations[self.config['lang']]['RECORDER.SILENCE'];
				
				// stream -> mediaSource -> javascriptNode -> destination
				self.context = new AudioContext();
				self.mediaStreamSource = self.context.createMediaStreamSource(stream);
				
				self.recorded = [];
				
				self.javascriptNode = self.context.createScriptProcessor(self.sampleSize, 1, 1);
				self.mediaStreamSource.connect(self.javascriptNode);
				self.javascriptNode.connect(self.context.destination);
				
				self.javascriptNode.onaudioprocess = function(data) { self.__processBuffer(data) };
				self.openStreams.push(stream);
			},
			self.errorCallback
		);
	}
	else {
		console.log('Missing support for getUserMedia. This will not work.');
	}
}

Recorder.prototype.encodeArrayToMP3 = function(item, name) {
	
	name = typeof(name) === 'undefined' ? 'Untitled' : name;
	var lib = new lamejs();
	var channels = 1; //1 for mono or 2 for stereo
	var sampleRate = item.sampleRate;
	var kbps = 64; //encode 128kbps mp3
	var mp3encoder = new lib.Mp3Encoder(channels, sampleRate, kbps);
	
	// Scale the values and import.
	var data = item.content;
	var samples = new Int16Array(data.length);
	for(var i = 0; i < data.length; ++i) {
		samples[i] = data[i] * 32767.5;
	}
	
	sampleBlockSize = 1152; //can be anything but make it a multiple of 576 to make encoders life easier

	var mp3Data = [];
	for (var i = 0; i < samples.length; i += sampleBlockSize) {
		sampleChunk = samples.subarray(i, i + sampleBlockSize);
		var mp3buf = mp3encoder.encodeBuffer(sampleChunk);
		if (mp3buf.length > 0) {
			mp3Data.push(mp3buf);
		}
	}
	
	var mp3buf = mp3encoder.flush();   //finish writing mp3

	if (mp3buf.length > 0) {
		mp3Data.push(new Int8Array(mp3buf));
	}

	return new File([new Blob(mp3Data, {type: 'audio/mp3'})], name);
}

Recorder.prototype.stopRecord = function() {
	for (var streamItem in this.openStreams) {
		var tracks = this.openStreams[streamItem].getTracks();
		for (var trackItem in tracks) {
			tracks[trackItem].stop();
		}
	}
	this.openStreams = [];
}
		