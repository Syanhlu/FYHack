// Larger local copies of analysed photos for the scrapbook board, by image ID. They stay
// in this panel's memory only and are dropped with the session.
const photoPreviews = new Map<string, string>();
export const photoPreview = (id: string) => photoPreviews.get(id);
export const keepPhotoPreview = (id: string, dataUrl: string) => photoPreviews.set(id, dataUrl);
export const forgetPhotoPreviews = () => photoPreviews.clear();
