/* eslint-disable no-unused-vars */
declare module '@mapbox/martini' {
  export class Martini {
    constructor(gridSize?: number);
    createTile(terrain: Float32Array | Uint16Array | Int32Array): {
      getMesh(meshMaxError: number): {
        vertices: Uint16Array;
        triangles: Uint32Array;
      };
    };
  }
  export default Martini;
}


