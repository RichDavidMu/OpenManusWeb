import { makeAutoObservable, observable } from 'mobx';
import { toast } from 'sonner';
import stream from '@/stream/stream.ts';

export class InputStore {
  input: string = '';
  files = observable.array<File>([]);

  constructor() {
    makeAutoObservable(this);
  }

  setInput(text: string) {
    this.input = text;
  }

  addFiles(newFiles: File[]) {
    this.files.push(...newFiles);
  }

  removeFile(index: number) {
    this.files.splice(index, 1);
  }

  clearFiles() {
    this.files.clear();
  }

  async handleSend() {
    if (!this.input.trim() && this.files.length === 0) {
      toast.info('please input your prompt');
      return;
    }
    if (stream.loading) {
      toast.info('task running, please wait for a while');
      return;
    }
    if (!stream.ready) {
      toast.info('please wait for llm ready');
      return;
    }
    await stream.task({ input: this.input });
    this.clearFiles();
  }
}
