# Privacy Notes

Prompt Professionalizer does not operate an extension-author backend.

- The configured API key is stored in `chrome.storage.local` on the user's browser profile.
- Prompt text is sent only to the model endpoint explicitly configured by the user and only after a user action.
- The extension does not sell, aggregate, or transmit prompt data to the extension author.
- Users are responsible for reviewing the privacy and retention policy of their chosen model provider.
- Removing the extension deletes extension-local storage according to Chrome's extension data lifecycle.
