import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';
import './styles/aspecto.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Escape cierra la ventana que esté encima. Las ventanas se cierran al pulsar
// su fondo oscuro (.overlay), así que basta con simular ese clic en la última.
// Si otra cosa ya usó la tecla (un menú, las sugerencias del editor), no se toca.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const capas = document.querySelectorAll<HTMLElement>('.overlay');
  const arriba = capas[capas.length - 1];
  if (arriba) arriba.click();
});
