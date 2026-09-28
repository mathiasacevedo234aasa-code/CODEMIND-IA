import React from 'react';
import { createRoot } from 'react-dom/client';
import './lib/monaco';
import App from './App';
import './styles/app.css';
import './styles/aspecto.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
