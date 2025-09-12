import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SideBar from './components/SideBar';
import App from './App';
import UploadImage from './components/UploadImage';
import {
    MultipleCogBitmapLayerExample,
    MultipleRioCogBitmapLayerExample,
    SingleCogBitmapLayerExample,
    CogMultibandExample,
    CogTerrainLayerExample,
} from './examples';
import { TestLayerExample } from './examples/TestLayerExample';

interface RoutesProps {}

const Routing: React.FC<RoutesProps> = () => (
  <BrowserRouter>
    <SideBar />
    <UploadImage />
    <Routes>
      <Route path={'/'} element={<App />} />
      <Route path={'/single-cog-bitmap-layer-example'} element={<SingleCogBitmapLayerExample />} />
      <Route path={'/multiple-cog-bitmap-layer-example'} element={<MultipleCogBitmapLayerExample />} />
      <Route path={'/multiple-cog-bitmap-layer-example-rio'} element={<MultipleRioCogBitmapLayerExample />} />
      <Route path={'/cog-terrain-layer-example'} element={<CogTerrainLayerExample />} />
      <Route path={'/cog-multiband-example'} element={<CogMultibandExample />} />
    </Routes>
  </BrowserRouter>
);

export default Routing;
