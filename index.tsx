
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Suppress benign ResizeObserver error commonly caused by Monaco Editor in flex layouts
// This error is harmless but noisy in the console
const originalError = console.error;
console.error = (...args) => {
  // Check if any argument contains the specific error message
  const isResizeError = args.some(arg => {
      const str = String(arg);
      return str.includes('ResizeObserver loop completed with undelivered notifications') || 
             str.includes('ResizeObserver loop limit exceeded');
  });

  if (isResizeError) {
    return;
  }
  originalError.apply(console, args);
};

window.addEventListener('error', (e) => {
  const msg = e.message || (e.error ? String(e.error) : '');
  if (
      msg.includes('ResizeObserver loop completed with undelivered notifications') ||
      msg.includes('ResizeObserver loop limit exceeded')
  ) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
