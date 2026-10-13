import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppBoundary } from './components/ErrorFallback';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <AppBoundary>
      <App />
    </AppBoundary>
  </StrictMode>,
);
