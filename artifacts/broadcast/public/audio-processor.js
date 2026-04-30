class FlacProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.maxBufferSize = 48000 * 2 * 2; // 1 second of stereo audio
    
    this.port.onmessage = (event) => {
      if (event.data && event.data.length > 0) {
        this.buffer.push(...event.data);
        
        if (this.buffer.length > this.maxBufferSize) {
          this.buffer = this.buffer.slice(-this.maxBufferSize);
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const channelCount = output.length;
    const frameCount = output[0].length;

    for (let i = 0; i < frameCount; i++) {
      if (this.buffer.length >= channelCount) {
        for (let ch = 0; ch < channelCount; ch++) {
          output[ch][i] = this.buffer.shift();
        }
      } else {
        for (let ch = 0; ch < channelCount; ch++) {
          output[ch][i] = 0;
        }
      }
    }

    return true;
  }
}

registerProcessor("flac-processor", FlacProcessor);