// Loads the YouTube IFrame Player API script exactly once and resolves
// once window.YT is ready to construct players with.
let apiPromise = null;

export function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });

  return apiPromise;
}

// Embedding-disabled / not-found error codes from the IFrame API.
export const YT_UNPLAYABLE_ERRORS = new Set([2, 5, 100, 101, 150]);
