import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import './styles.css';

const rootElement = document.querySelector<HTMLDivElement>('#root');

if (!rootElement) {
  throw new Error('Missing application root');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
