const isOrukeetEndpoint = () => false;
const isSelfHostedTranscription = () => false;

export function shouldSkipTranscriptionApiKey(settings) {
  return isSelfHostedTranscription(settings) && !isOrukeetEndpoint(settings);
}
