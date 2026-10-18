const PORTRAIT_CLIPS = [
  "https://videos.pexels.com/video-files/2795405/2795405-hd_720_1280_25fps.mp4",
  "https://videos.pexels.com/video-files/29569340/12727635_360_640_60fps.mp4",
  "https://videos.pexels.com/video-files/34554257/14647656_360_640_50fps.mp4",
  "https://videos.pexels.com/video-files/34534136/14632380_360_640_50fps.mp4",
  "https://videos.pexels.com/video-files/29569367/12727647_360_640_60fps.mp4",
  "https://videos.pexels.com/video-files/34550102/14640317_360_640_50fps.mp4",
];

export function pickMockVideo() {
  const index = Math.floor(Math.random() * PORTRAIT_CLIPS.length);
  return PORTRAIT_CLIPS[index] ?? PORTRAIT_CLIPS[0];
}

export function isFalCreditError(message: string) {
  return /credit|quota|exhausted|insufficient|payment required|billing|balance|402/i.test(message);
}

export function isMockVideoUrl(value: string) {
  try {
    const host = new URL(value).hostname;
    return host === "videos.pexels.com" || host === "cdn.pixabay.com" || host.endsWith(".pixabay.com");
  } catch {
    return false;
  }
}
