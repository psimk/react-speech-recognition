import { SessionsClient } from 'dialogflow';
import { ReadStream, WriteStream, createWriteStream } from 'fs';
import { IStreamConfig } from './types';
import utils from './utils';

interface IAudioStreamerHandlers {
  onMessage: (() => {}) | any;
  onError: (() => {}) | any;
}

const DEBUG_FILE = 'debug.raw';

const enum EVENTS {
  Error = 'error',
  Data = 'data',
}

export default class AudioStreamer {
  private hasEnded: boolean = false;
  private stream: (WriteStream & ReadStream) | null = null;
  private fileStream: WriteStream | null = null;

  private client: SessionsClient | undefined;
  private sessionId: string;
  private debug: boolean;
  private handlers: IAudioStreamerHandlers;

  constructor(handlers: IAudioStreamerHandlers, sessionId: string, debug: boolean = false) {
    this.handlers = handlers;
    this.debug = debug;
    this.sessionId = sessionId;
  }

  private checkResult(data: any) {
    if (this.hasEnded) return;
    if (data && data.recognitionResult && data.recognitionResult.isFinal) this.stop();
  }

  public start(config: IStreamConfig) {
    this.client =
      this.client ||
      new SessionsClient({
        projectId: config.projectId,
        keyFilename: utils.getClientSecretPath(),
      });

    // @ts-ignore
    const stream = this.client.streamingDetectIntent() as WriteStream & ReadStream;

    stream
      .on(EVENTS.Error, this.handlers.onError)
      .on(EVENTS.Data, this.handlers.onMessage)
      .on(EVENTS.Data, (data: any) => this.checkResult(data));

    stream.write(utils.createInitialStreamRequest({ ...config, sessionId: this.sessionId }));

    this.stream = stream;

    this.hasEnded = false;
    this.time = undefined;

    if (this.debug) {
      console.log(`AudioStreamer: Started`);
      console.log(config);

      this.fileStream = createWriteStream(DEBUG_FILE);
    }
  }

  public write(inputAudio: Buffer) {
    if (this.hasEnded) return;

    if (this.stream) this.stream.write({ inputAudio });
    if (this.fileStream) this.fileStream.write(inputAudio);
  }

  public stop() {
    this.hasEnded = true;

    if (this.stream) {
      this.stream.end();
      this.stream = null;
    }

    if (this.fileStream) {
      this.fileStream.end();
      this.fileStream = null;
    }

    if (this.debug) {
      console.log(`AudioStreamer: Stopped`);
    }
  }
}