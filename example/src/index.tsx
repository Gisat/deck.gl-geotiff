import React from 'react';
import ReactDOM from 'react-dom';
import Routing from './Routes';
import './index.css';
import { RecoilRoot } from 'recoil';

ReactDOM.render(
  <React.StrictMode>
    {/* @ts-ignore */}
    <RecoilRoot>
      <Routing />
    </RecoilRoot>
  </React.StrictMode>,
  document.getElementById('root'),
);
