import React from 'react';
import { createRoot } from 'react-dom/client'; // 1. Changed import
import Routing from './Routes';
import './index.css';
import { RecoilRoot } from 'recoil';

const container = document.getElementById('root');

const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <RecoilRoot>
      <Routing />
    </RecoilRoot>
  </React.StrictMode>
);
