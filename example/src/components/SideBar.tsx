import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { useReducer } from '../recoil/reducers';
const SideBar = () => {
  const [opacity, setOpacity] = useState<number>(255);
  const { updateOpacity } = useReducer();

  const submitOpacity = () => {
    updateOpacity(opacity);
  };
  return (
    <SideNav>
      <NavLink to="/cog-bitmap-layer-example">COG Bitmap Layer</NavLink>
      <NavLink to="/cog-terrain-layer-example">COG Terrain Layer</NavLink>
      <NavLink to="/cog-multiband-example">COG Multiband</NavLink>
      {
      //<NavLink to="/test-layer-example">Test Layer</NavLink>
      }
      <Divider />
    </SideNav>
  );
};

const SideNav = styled.div`
  width: 300px;
  height: 100%;
  background-color: white;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 100;
  box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
  display: flex;
  flex-direction: column;
`;

const Input = styled.input`
  border-radius: 20px;
  margin: 10px;
  padding-left: 8px;
  width: 100px;
  height: 30px;
  border: solid;
  border-color: grey;
`;
const HStack = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

const Button = styled.button`
  border: none;
  padding: 12px;
  border-radius: 25px;
  color: white;
  background-color: #0087e0;
`;

const Divider = styled.div`
  margin-top: 6px;
  margin-bottom: 4px;
  align-self: center;
  width: 90%;
  height: 1px;
  background-color: grey;
`;

const NavLink = styled(Link)`
  padding: 5px;
  padding-left: 10px;
  text-decoration: none;
  color: black;
  font-weight: 400;
  font-size: 20px;
  &:hover {
    background-color: whitesmoke;
  }
`;
export default SideBar;
