/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': { src?: string; 'camera-controls'?: boolean; 'auto-rotate'?: boolean; 'shadow-intensity'?: string; ar?: string; 'aria-label'?: string }
    }
  }
}
