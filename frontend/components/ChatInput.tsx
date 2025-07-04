import { ChevronDown, Check, ArrowUpIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { Textarea } from './ui/textarea';
import { cn } from '../../lib/utils';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import useAutoResizeTextarea from '../../hooks/useAutoResizeTextArea';
import { UseChatHelpers, useCompletion } from '@ai-sdk/react';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useCreateMessage, useCreateThread } from '../hooks/useSupabaseData';
import { useAPIKeyStore } from '../stores/APIKeyStore';
import { useModelStore } from '../stores/ModelStore';
import { AI_MODELS, AIModel, getModelConfig } from '../../lib/models';
import KeyPrompt from './KeyPrompt';
import { UIMessage } from 'ai';
import { v4 as uuidv4 } from 'uuid';
import { StopIcon } from './ui/icons';
import { toast } from 'sonner';
import { useMessageSummary } from '../hooks/useMessageSummary';
import { useSidebar } from './ui/sidebar';
import { useAuth } from '../providers/SupabaseAuthProvider';

// Declare global types for our submission tracking
declare global {
  interface Window {
    _isSubmitting: boolean;
    _lastSubmissionTime: number;
    _submissionCount: number;
  }
}

// Create a global submission lock to prevent duplicate submissions
if (typeof window !== 'undefined') {
  window._isSubmitting = window._isSubmitting || false;
  window._lastSubmissionTime = window._lastSubmissionTime || 0;
  window._submissionCount = window._submissionCount || 0;
}

interface ChatInputProps {
  threadId: string;
  input: UseChatHelpers['input'];
  status: UseChatHelpers['status'];
  setInput: UseChatHelpers['setInput'];
  append: UseChatHelpers['append'];
  stop: UseChatHelpers['stop'];
  userId: string;
}

interface StopButtonProps {
  stop: UseChatHelpers['stop'];
}

interface SendButtonProps {
  onSubmit: () => void;
  disabled: boolean;
}

const createUserMessage = (id: string, text: string): UIMessage => ({
  id,
  parts: [{ type: 'text', text }],
  role: 'user',
  content: text,
  createdAt: new Date(),
});

function PureChatInput({
  threadId,
  input,
  status,
  setInput,
  append,
  stop,
  userId,
}: ChatInputProps) {
  const canChat = useAPIKeyStore((state) => state.hasRequiredKeys());
  const createMessage = useCreateMessage();
  const createThread = useCreateThread();
  const isSubmittingRef = useRef(false);
  const { isOpen: sidebarIsOpen, position: sidebarPosition } = useSidebar();

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 72,
    maxHeight: 200,
  });

  const navigate = useNavigate();
  const { id } = useParams();

  // Keep track of sidebar state for proper positioning
  const isDisabled = useMemo(
    () => !input.trim() || status !== 'ready' || isSubmittingRef.current,
    [input, status]
  );

  const { complete } = useMessageSummary();

  const handleSubmit = useCallback(async () => {
    const currentInput = textareaRef.current?.value || input;
    if (!currentInput.trim() || status !== 'ready' || window._isSubmitting) return;

    window._isSubmitting = true;
    isSubmittingRef.current = true;
    
    try {
      // Create a message ID
      const messageId = uuidv4();
      const userMessage = createUserMessage(messageId, currentInput.trim());
      
      // Clear input and reset height immediately
      setInput('');
      adjustHeight(true);
      
      // Handle thread creation if necessary
      if (!id) {
        // Create a new thread if we're not in one
        const newThreadId = await createThread("New Chat", userId);
        navigate(`/chat/${newThreadId || threadId}`);
        complete(userMessage.content.toString());
      } else {
        complete(userMessage.content.toString());
      }

      // Save message to database
      await createMessage(threadId, userMessage, userId);
      
      // Append message to UI
      await append(userMessage);
    } catch (error) {
      console.error('Error submitting message:', error);
      toast.error('Failed to send message');
    } finally {
      window._isSubmitting = false;
      isSubmittingRef.current = false;
    }
  }, [
    input,
    status,
    setInput,
    adjustHeight,
    append,
    id,
    textareaRef,
    threadId,
    complete,
    userId,
    createMessage,
    createThread,
    navigate,
  ]);

  if (!canChat) {
    return <KeyPrompt />;
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    adjustHeight();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 mx-auto w-full z-10">
      <div className="mx-auto max-w-3xl">
        <div className="bg-secondary rounded-t-[20px] p-2 pb-0 shadow-lg">
          <div className="relative">
            <div className="flex flex-col">
              <div className="bg-secondary overflow-y-auto max-h-[300px]">
                <Textarea
                  id="chat-input"
                  value={input}
                  placeholder="What can I do for you?"
                  className={cn(
                    'w-full px-4 py-3 border-none shadow-none dark:bg-transparent',
                    'placeholder:text-muted-foreground resize-none',
                    'focus-visible:ring-0 focus-visible:ring-offset-0',
                    'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/30',
                    'scrollbar-thumb-rounded-full',
                    'min-h-[72px]'
                  )}
                  ref={textareaRef}
                  onKeyDown={handleKeyDown}
                  onChange={handleInputChange}
                  aria-label="Chat message input"
                  aria-describedby="chat-input-description"
                  disabled={status !== 'ready' || isSubmittingRef.current}
                />
                <span id="chat-input-description" className="sr-only">
                  Press Enter to send, Shift+Enter for new line
                </span>
              </div>

              <div className="h-14 flex items-center px-2">
                <div className="flex items-center justify-between w-full">
                  <ChatModelDropdown />

                  {status === 'streaming' ? (
                    <StopButton stop={stop} />
                  ) : (
                    <SendButton 
                      onSubmit={handleSubmit} 
                      disabled={isDisabled} 
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ChatInput = memo(PureChatInput, (prevProps, nextProps) => {
  if (prevProps.input !== nextProps.input) return false;
  if (prevProps.status !== nextProps.status) return false;
  if (prevProps.userId !== nextProps.userId) return false;
  if (prevProps.threadId !== nextProps.threadId) return false;
  return true;
});

const PureChatModelDropdown = () => {
  const getKey = useAPIKeyStore((state) => state.getKey);
  const { selectedModel, setModel } = useModelStore();

  const isModelEnabled = useCallback(
    (model: AIModel) => {
      const modelConfig = getModelConfig(model);
      const apiKey = getKey(modelConfig.provider);
      return !!apiKey;
    },
    [getKey]
  );

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-1 h-8 pl-2 pr-2 text-xs rounded-md text-foreground hover:bg-primary/10 focus-visible:ring-1 focus-visible:ring-offset-0 focus-visible:ring-blue-500"
            aria-label={`Selected model: ${selectedModel}`}
          >
            <div className="flex items-center gap-1">
              {selectedModel}
              <ChevronDown className="w-3 h-3 opacity-50" />
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={cn('min-w-[10rem]', 'border-border', 'bg-popover')}
        >
          {AI_MODELS.map((model) => {
            const isEnabled = isModelEnabled(model);
            return (
              <DropdownMenuItem
                key={model}
                onSelect={() => isEnabled && setModel(model)}
                disabled={!isEnabled}
                className={cn(
                  'flex items-center justify-between gap-2',
                  'cursor-pointer'
                )}
              >
                <span>{model}</span>
                {selectedModel === model && (
                  <Check
                    className="w-4 h-4 text-blue-500"
                    aria-label="Selected"
                  />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

const ChatModelDropdown = memo(PureChatModelDropdown);

function PureStopButton({ stop }: StopButtonProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={stop}
      aria-label="Stop generating response"
    >
      <StopIcon size={20} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);

const PureSendButton = ({ onSubmit, disabled }: SendButtonProps) => {
  return (
    <Button
      onClick={onSubmit}
      variant="default"
      size="icon"
      disabled={disabled}
      aria-label="Send message"
    >
      <ArrowUpIcon size={18} />
    </Button>
  );
};

const SendButton = memo(PureSendButton, (prevProps, nextProps) => {
  return prevProps.disabled === nextProps.disabled;
});

export default ChatInput;
