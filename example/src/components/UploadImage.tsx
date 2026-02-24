import React from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload } from '@fortawesome/free-solid-svg-icons';
import { useReducer } from '../recoil/reducers';
const UploadImage = () => {
  const { updateUploaded } = useReducer();

  const fileBrowseHandler = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const value = URL.createObjectURL(event.target.files[0]);
    updateUploaded(value);
  };

  return (
    <Container>
      <label>
        <Input>
          <FontAwesomeIcon icon={faUpload} />
        </Input>
        <input
          onChange={fileBrowseHandler}
          accept=".tif"
          type="file"
          style={{ display: 'none' }}
        />
      </label>
    </Container>
  );
};
const Container = styled.div`
  position: absolute;
  right: 0;
  top: 0;
  margin: 20px;
  z-index: 100;
`;

const Input = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  background: #0087e0;
  color: #fff;
  margin-bottom: 0;
  text-transform: uppercase;
  width: 50px;
  border-radius: 50%;
  height: 50px;
  border-color: transparent;
  outline: none;
  text-align: center;
  &:active {
    background-color: #f1ac15;
  }
`;
export default UploadImage;
