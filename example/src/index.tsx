import React from 'react';
import { createRoot } from 'react-dom/client'; // 1. Changed import
import Routing from './Routes';
import './index.css';
import { RecoilRoot } from 'recoil';

const container = document.getElementById('root');

const root = createRoot(container!);

root.render(
  // <React.StrictMode> is disabled because it causes WebGL context crashes in deck.gl v9 (maxTextureDimension2D error)
  // due to double-initialization in React 18 development mode.
  <RecoilRoot>
    <Routing />
  </RecoilRoot>
  // </React.StrictMode>
);
