import React from 'react';
import { createRoot } from 'react-dom/client'; // 1. Changed import
import Routing from './Routes';
import './index.css';
import { RecoilRoot } from 'recoil';

const container = document.getElementById('root');

const root = createRoot(container!);
/**
 * NOTE: React.StrictMode is intentionally disabled.
 * In React 18 development mode, StrictMode causes double-initialization of components.
 * For Deck.gl v9, this leads to WebGL context crashes and 'maxTextureDimension2D' errors
 * due to resource contention during the simultaneous boot of two GL contexts.
 */
root.render(
  <RecoilRoot>
    <Routing />
  </RecoilRoot>
);
