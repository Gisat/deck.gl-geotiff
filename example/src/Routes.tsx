import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SideBar from './components/SideBar';
import App from './App';
import UploadImage from './components/UploadImage';
import {
    CogBitmapLayerExample, CogMultibandExample,
    CogTerrainLayerExample,
} from './examples';

interface RoutesProps {}

const Routing: React.FC<RoutesProps> = () => (
  <BrowserRouter>
    <SideBar />
    <UploadImage />
    <Routes>
      <Route path={'/'} element={<App />} />
      <Route path={'/cog-bitmap-layer-example'} element={<CogBitmapLayerExample />} />
      <Route path={'/cog-terrain-layer-example'} element={<CogTerrainLayerExample />} />
      <Route path={'/cog-multiband-example'} element={<CogMultibandExample />} />
    </Routes>
  </BrowserRouter>
);

export default Routing;
