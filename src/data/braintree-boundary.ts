// Simplified GeoJSON boundary for Braintree constituency
// Based on the 2024 constituency boundaries
export const braintreeBoundary: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        name: "Braintree",
        code: "E14001128",
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0.4200, 51.7700],
            [0.4350, 51.7650],
            [0.4600, 51.7620],
            [0.4900, 51.7580],
            [0.5200, 51.7550],
            [0.5500, 51.7530],
            [0.5800, 51.7560],
            [0.6100, 51.7600],
            [0.6400, 51.7650],
            [0.6700, 51.7720],
            [0.6900, 51.7800],
            [0.7100, 51.7900],
            [0.7250, 51.8000],
            [0.7350, 51.8150],
            [0.7400, 51.8300],
            [0.7450, 51.8450],
            [0.7500, 51.8600],
            [0.7480, 51.8750],
            [0.7400, 51.8900],
            [0.7350, 51.9050],
            [0.7250, 51.9200],
            [0.7100, 51.9350],
            [0.6950, 51.9450],
            [0.6750, 51.9550],
            [0.6500, 51.9620],
            [0.6250, 51.9680],
            [0.6000, 51.9700],
            [0.5750, 51.9710],
            [0.5500, 51.9700],
            [0.5250, 51.9680],
            [0.5000, 51.9640],
            [0.4750, 51.9580],
            [0.4500, 51.9500],
            [0.4300, 51.9400],
            [0.4150, 51.9280],
            [0.4050, 51.9150],
            [0.3950, 51.9000],
            [0.3900, 51.8850],
            [0.3880, 51.8700],
            [0.3900, 51.8550],
            [0.3950, 51.8400],
            [0.4000, 51.8250],
            [0.4050, 51.8100],
            [0.4100, 51.7950],
            [0.4150, 51.7830],
            [0.4200, 51.7700],
          ],
        ],
      },
    },
  ],
};

// Simplified ward boundaries for choropleth
export const wardBoundaries: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "Bocking Blackwater", conVote: 42 },
      geometry: { type: "Polygon", coordinates: [[[0.54, 51.88], [0.58, 51.88], [0.58, 51.91], [0.54, 51.91], [0.54, 51.88]]] },
    },
    {
      type: "Feature",
      properties: { name: "Braintree Central", conVote: 35 },
      geometry: { type: "Polygon", coordinates: [[[0.54, 51.86], [0.58, 51.86], [0.58, 51.88], [0.54, 51.88], [0.54, 51.86]]] },
    },
    {
      type: "Feature",
      properties: { name: "Braintree South", conVote: 37 },
      geometry: { type: "Polygon", coordinates: [[[0.54, 51.84], [0.58, 51.84], [0.58, 51.86], [0.54, 51.86], [0.54, 51.84]]] },
    },
    {
      type: "Feature",
      properties: { name: "Coggeshall", conVote: 45 },
      geometry: { type: "Polygon", coordinates: [[[0.49, 51.84], [0.54, 51.84], [0.54, 51.87], [0.49, 51.87], [0.49, 51.84]]] },
    },
    {
      type: "Feature",
      properties: { name: "Halstead", conVote: 34 },
      geometry: { type: "Polygon", coordinates: [[[0.58, 51.92], [0.64, 51.92], [0.64, 51.96], [0.58, 51.96], [0.58, 51.92]]] },
    },
    {
      type: "Feature",
      properties: { name: "Hedingham & Maplestead", conVote: 48 },
      geometry: { type: "Polygon", coordinates: [[[0.64, 51.92], [0.72, 51.92], [0.72, 51.96], [0.64, 51.96], [0.64, 51.92]]] },
    },
    {
      type: "Feature",
      properties: { name: "Kelvedon & Feering", conVote: 43 },
      geometry: { type: "Polygon", coordinates: [[[0.58, 51.82], [0.65, 51.82], [0.65, 51.86], [0.58, 51.86], [0.58, 51.82]]] },
    },
    {
      type: "Feature",
      properties: { name: "Witham North", conVote: 36 },
      geometry: { type: "Polygon", coordinates: [[[0.62, 51.78], [0.68, 51.78], [0.68, 51.82], [0.62, 51.82], [0.62, 51.78]]] },
    },
    {
      type: "Feature",
      properties: { name: "Witham South", conVote: 38 },
      geometry: { type: "Polygon", coordinates: [[[0.62, 51.76], [0.68, 51.76], [0.68, 51.78], [0.62, 51.78], [0.62, 51.76]]] },
    },
    {
      type: "Feature",
      properties: { name: "Gosfield & Greenstead Green", conVote: 50 },
      geometry: { type: "Polygon", coordinates: [[[0.58, 51.88], [0.64, 51.88], [0.64, 51.92], [0.58, 51.92], [0.58, 51.88]]] },
    },
    {
      type: "Feature",
      properties: { name: "Rayne", conVote: 44 },
      geometry: { type: "Polygon", coordinates: [[[0.49, 51.87], [0.54, 51.87], [0.54, 51.90], [0.49, 51.90], [0.49, 51.87]]] },
    },
    {
      type: "Feature",
      properties: { name: "Black Notley & Terling", conVote: 41 },
      geometry: { type: "Polygon", coordinates: [[[0.54, 51.82], [0.58, 51.82], [0.58, 51.84], [0.54, 51.84], [0.54, 51.82]]] },
    },
    {
      type: "Feature",
      properties: { name: "Earls Colne", conVote: 44 },
      geometry: { type: "Polygon", coordinates: [[[0.64, 51.88], [0.72, 51.88], [0.72, 51.92], [0.64, 51.92], [0.64, 51.88]]] },
    },
    {
      type: "Feature",
      properties: { name: "Silver End & Rivenhall", conVote: 35 },
      geometry: { type: "Polygon", coordinates: [[[0.58, 51.78], [0.62, 51.78], [0.62, 51.82], [0.58, 51.82], [0.58, 51.78]]] },
    },
    {
      type: "Feature",
      properties: { name: "Hatfield Peverel", conVote: 42 },
      geometry: { type: "Polygon", coordinates: [[[0.58, 51.76], [0.62, 51.76], [0.62, 51.78], [0.58, 51.78], [0.58, 51.76]]] },
    },
  ],
};
