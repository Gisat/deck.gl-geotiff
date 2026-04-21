// loaders.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import { concatenateTypedArrays } from '@loaders.gl/loader-utils';

export type EdgeIndices = {
  westIndices: number[];
  northIndices: number[];
  eastIndices: number[];
  southIndices: number[];
};

/**
 * Get geometry edges that located on a border of the mesh
 * @param {object} indices - edge indices from quantized mesh data
 * @param {TypedArray} position - position attribute geometry data
 * @returns {number[][]} - outside edges data
 */
function getOutsideEdgesFromIndices(indices: EdgeIndices, position: ArrayLike<number>): number[][] {
  // Sort skirt indices to create adjacent triangles
  indices.westIndices.sort((a, b) => position[3 * a + 1] - position[3 * b + 1]);
  // Reverse (b - a) to match triangle winding
  indices.eastIndices.sort((a, b) => position[3 * b + 1] - position[3 * a + 1]);
  indices.southIndices.sort((a, b) => position[3 * b] - position[3 * a]);
  // Reverse (b - a) to match triangle winding
  indices.northIndices.sort((a, b) => position[3 * a] - position[3 * b]);

  const edges: number[][] = [];
  for (const index in indices) {
    const indexGroup = (indices as Record<string, number[]>)[index];
    for (let i = 0; i < indexGroup.length - 1; i++) {
      edges.push([indexGroup[i], indexGroup[i + 1]]);
    }
  }
  return edges;
}

/**
 * Add skirt to existing mesh
 * @param {object} attributes - POSITION and TEXCOOD_0 attributes data
 * @param {any} triangles - indices array of the mesh geometry
 * @param skirtHeight - height of the skirt geometry
 * @param outsideIndices - edge indices from quantized mesh data
 * @returns - geometry data with added skirt
 */
export function addSkirt(attributes: any, triangles: any, skirtHeight: number, outsideIndices?: EdgeIndices) {
  const outsideEdges = outsideIndices
    ? getOutsideEdgesFromIndices(outsideIndices, attributes.POSITION.value)
    : getOutsideEdgesFromTriangles(triangles);

  // 2 new vertices for each outside edge
  const newPosition = new attributes.POSITION.value.constructor(outsideEdges.length * 6);
  const newTexcoord0 = new attributes.TEXCOORD_0.value.constructor(outsideEdges.length * 4);

  // 2 new triangles for each outside edge
  const newTriangles = new triangles.constructor(outsideEdges.length * 6);

  for (let i = 0; i < outsideEdges.length; i++) {
    const edge = outsideEdges[i];

    updateAttributesForNewEdge({
      edge,
      edgeIndex: i,
      attributes,
      skirtHeight,
      newPosition,
      newTexcoord0,
      newTriangles,
    });
  }

  attributes.POSITION.value = concatenateTypedArrays(attributes.POSITION.value, newPosition);
  attributes.TEXCOORD_0.value = concatenateTypedArrays(attributes.TEXCOORD_0.value, newTexcoord0);
  const resultTriangles = triangles instanceof Array
    ? triangles.concat(newTriangles)
    : concatenateTypedArrays(triangles, newTriangles);

  return {
    attributes,
    triangles: resultTriangles,
  };
}

/**
 * Get geometry edges that located on a border of the mesh
 * @param {any} triangles - indices array of the mesh geometry
 * @returns {number[][]} - outside edges data
 */
function getOutsideEdgesFromTriangles(triangles: any): number[][] {
  const edgeMap = new Map<number, number[]>();

  for (let i = 0; i < triangles.length; i += 3) {
    const v0 = triangles[i];
    const v1 = triangles[i + 1];
    const v2 = triangles[i + 2];

    // Process edges: (v0, v1), (v1, v2), (v2, v0)
    // Use numeric key: min * large_prime + max to avoid string allocation overhead
    const edges = [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ];

    for (const edge of edges) {
      const min = Math.min(edge[0], edge[1]);
      const max = Math.max(edge[0], edge[1]);
      // Use numeric key: min * 65536 + max (assumes vertex indices fit in 16 bits per component)
      const key = (min << 16) | max;

      if (edgeMap.has(key)) {
        edgeMap.delete(key);
      } else {
        edgeMap.set(key, edge);
      }
    }
  }

  return Array.from(edgeMap.values());
}

/**
 * Get geometry edges that located on a border of the mesh
 * @param {object} args
 * @param {number[]} args.edge - edge indices in geometry
 * @param {number} args.edgeIndex - edge index in outsideEdges array
 * @param {object} args.attributes - POSITION and TEXCOORD_0 attributes
 * @param {number} args.skirtHeight - height of the skirt geometry
 * @param {TypedArray} args.newPosition - POSITION array for skirt data
 * @param {TypedArray} args.newTexcoord0 - TEXCOORD_0 array for skirt data
 * @param {TypedArray | Array} args.newTriangles - trinagle indices array for skirt data
 * @returns {void}
 */
function updateAttributesForNewEdge({
  edge,
  edgeIndex,
  attributes,
  skirtHeight,
  newPosition,
  newTexcoord0,
  newTriangles,
}: {
  edge: number[];
  edgeIndex: number;
  attributes: any;
  skirtHeight: number;
  newPosition: any;
  newTexcoord0: any;
  newTriangles: any;
}): void {
  const positionsLength = attributes.POSITION.value.length;
  const vertex1Offset = edgeIndex * 2;
  const vertex2Offset = edgeIndex * 2 + 1;

  // Define POSITION for new 1st vertex
  newPosition.set(
    attributes.POSITION.value.subarray(edge[0] * 3, edge[0] * 3 + 3),
    vertex1Offset * 3,
  );
  newPosition[vertex1Offset * 3 + 2] = newPosition[vertex1Offset * 3 + 2] - skirtHeight; // put down elevation on the skirt height

  // Define POSITION for new 2nd vertex
  newPosition.set(
    attributes.POSITION.value.subarray(edge[1] * 3, edge[1] * 3 + 3),
    vertex2Offset * 3,
  );
  newPosition[vertex2Offset * 3 + 2] = newPosition[vertex2Offset * 3 + 2] - skirtHeight; // put down elevation on the skirt height

  // Use same TEXCOORDS for skirt vertices
  newTexcoord0.set(
    attributes.TEXCOORD_0.value.subarray(edge[0] * 2, edge[0] * 2 + 2),
    vertex1Offset * 2,
  );
  newTexcoord0.set(
    attributes.TEXCOORD_0.value.subarray(edge[1] * 2, edge[1] * 2 + 2),
    vertex2Offset * 2,
  );

  // Define new triangles
  const triangle1Offset = edgeIndex * 2 * 3;
  newTriangles[triangle1Offset] = edge[0];
  newTriangles[triangle1Offset + 1] = positionsLength / 3 + vertex2Offset;
  newTriangles[triangle1Offset + 2] = edge[1];

  newTriangles[triangle1Offset + 3] = positionsLength / 3 + vertex2Offset;
  newTriangles[triangle1Offset + 4] = edge[0];
  newTriangles[triangle1Offset + 5] = positionsLength / 3 + vertex1Offset;
}
