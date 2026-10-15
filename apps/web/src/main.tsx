// Entry point: mounts the Plant Ops Dashboard (behind the login gate) into #root.
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import AuthGate from './components/AuthGate';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find root element with id "root"');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
