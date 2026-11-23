import type { GraphGameDefinition, NodeSpec } from '@chain-protocol/casino-sdk/graph-engine';

export const LABEL = { cashOut: 0 } as const;
export const HOLE_OFFSET = 10;

const LADDERS: number[][] = [
  [0, 115, 144, 192, 288, 576],
  [0, 144, 240, 480, 1440],
  [0, 192, 480, 1920],
];
const RATS = [5, 4, 3];
const FARMERS = [1, 2, 3];

type State =
  | { at: 'start'; gun: number }
  | { at: 'shooting'; gun: number; ratsLeft: number; farmersLeft: number; kills: number }
  | { at: 'shotResult'; gun: number; ratsLeft: number; farmersLeft: number; kills: number; hit: 'rat' | 'farmer' }
  | { at: 'cash'; gun: number; kills: number }
  | { at: 'bust'; gun: number };

const title: GraphGameDefinition<State> = {
  prizeDenominator: 100,
  roots: [
    { at: 'start', gun: 0 },
    { at: 'start', gun: 1 },
    { at: 'start', gun: 2 },
  ],
  key: s => JSON.stringify(s),
  expand: (state): NodeSpec<State> => {
    switch (state.at) {
      case 'start':
        return {
          kind: 'chance',
          outcomes: [
            {
              state: { at: 'shooting', gun: state.gun, ratsLeft: RATS[state.gun], farmersLeft: FARMERS[state.gun], kills: 0 },
              weight: 1,
              label: HOLE_OFFSET,
            },
          ],
        };
        
      case 'shooting': {
        const cash: { state: State; label: number } = {
          state: { at: 'cash', gun: state.gun, kills: state.kills },
          label: LABEL.cashOut,
        };
        if (state.ratsLeft === 0) return { kind: 'decision', actions: [cash] };
        
        const shoot: { state: State; label: number } = {
          state: { at: 'shotResult', gun: state.gun, ratsLeft: state.ratsLeft, farmersLeft: state.farmersLeft, kills: state.kills, hit: 'rat' },
          label: HOLE_OFFSET + 1,
        };
        
        return { kind: 'decision', actions: [cash, shoot] };
      }
      
      case 'shotResult': {
        const totalLeft = state.ratsLeft + state.farmersLeft;
        const ratWeight = state.ratsLeft;
        const farmerWeight = state.farmersLeft;
        
        return {
          kind: 'chance',
          outcomes: [
            {
              state: { at: 'shooting', gun: state.gun, ratsLeft: state.ratsLeft - 1, farmersLeft: state.farmersLeft, kills: state.kills + 1 },
              weight: ratWeight,
              label: HOLE_OFFSET + 2,
            },
            {
              state: { at: 'bust', gun: state.gun },
              weight: farmerWeight,
              label: HOLE_OFFSET + 3,
            },
          ],
        };
      }
      
      case 'cash':
        return { kind: 'terminal', prize: LADDERS[state.gun][state.kills] };
        
      case 'bust':
        return { kind: 'terminal', prize: 0 };
    }
  },
};

export default title;