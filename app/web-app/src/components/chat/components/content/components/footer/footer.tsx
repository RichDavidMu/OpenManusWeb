import { observer } from 'mobx-react-lite';
import { Paperclip, Send, X } from 'lucide-react';
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/ui/prompt-input.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Loader } from '@/components/ui/loader.tsx';
import { PromptSuggestion } from '@/components/ui/prompt-suggestion.tsx';
import { FileUpload, FileUploadContent, FileUploadTrigger } from '@/components/ui/file-upload.tsx';
import rootStore from '@/stores/root-store.ts';
import stream from '@/stream/stream.ts';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const Footer = observer(() => {
  const { inputStore } = rootStore;

  const promptSuggestions = ['写一篇特朗普2025年关税政策评价', '写一篇ai领域股票投资建议'];

  const handleSuggestionClick = (suggestion: string) => {
    inputStore.setInput(suggestion);
  };

  const handleFilesAdded = (files: File[]) => {
    inputStore.addFiles(files);
  };

  return (
    <div className="space-y-3 mt-4">
      {/* Prompt Suggestions */}
      {!inputStore.input && inputStore.files.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {promptSuggestions.map((suggestion, index) => (
            <PromptSuggestion key={index} onClick={() => handleSuggestionClick(suggestion)}>
              {suggestion}
            </PromptSuggestion>
          ))}
        </div>
      )}

      {/* Prompt Input */}
      <FileUpload onFilesAdded={handleFilesAdded} disabled={stream.loading}>
        <PromptInput
          value={inputStore.input}
          onValueChange={(value) => inputStore.setInput(value)}
          onSubmit={() => inputStore.handleSend()}
          disabled={stream.loading}
        >
          <PromptInputTextarea placeholder="Type your prompt here..." />

          {/* File Preview */}
          {inputStore.files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pb-1">
              {inputStore.files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="bg-muted flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
                >
                  <Paperclip className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <span className="text-muted-foreground text-xs">{formatFileSize(file.size)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      inputStore.removeFile(index);
                    }}
                    className="text-muted-foreground hover:text-foreground ml-1 rounded-full p-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <PromptInputActions className="justify-between px-2 pb-2">
            {/* File Upload Button (bottom-left) */}
            <PromptInputAction tooltip="Upload File">
              <FileUploadTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-full"
                  disabled={stream.loading}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </FileUploadTrigger>
            </PromptInputAction>

            {/* Send Button (bottom-right) */}
            <PromptInputAction
              tooltip={stream.ready ? 'Send Message' : `Loading Model: \n${stream.readyProgress}`}
              className="max-w-sm"
            >
              <Button
                size="icon"
                disabled={
                  (!inputStore.input.trim() && inputStore.files.length === 0) ||
                  stream.loading ||
                  !stream.ready
                }
                onClick={() => inputStore.handleSend()}
                className="h-9 w-9 rounded-full"
              >
                {stream.loading ? (
                  <Loader
                    variant="circular"
                    size="sm"
                    className="border-primary-foreground border-t-transparent"
                  />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </PromptInputAction>
          </PromptInputActions>
        </PromptInput>

        {/* Drag & Drop Overlay */}
        <FileUploadContent>
          <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 p-8">
            <Paperclip className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium text-primary">Drop files here</p>
          </div>
        </FileUploadContent>
      </FileUpload>
    </div>
  );
});

export default Footer;
