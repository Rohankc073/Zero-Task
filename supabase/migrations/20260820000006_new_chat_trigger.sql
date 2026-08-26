-- Add trigger for new chat_channels to decouple New Chat from New Message
DROP TRIGGER IF EXISTS trg_push_chat_channel ON public.chat_channels;
CREATE TRIGGER trg_push_chat_channel
AFTER INSERT ON public.chat_channels
FOR EACH ROW
EXECUTE FUNCTION public.invoke_push_alert_v2();
