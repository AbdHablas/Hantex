/**
 * Named views of a 3D model, as `<model-viewer>` camera angles: how far round the model (0° is
 * the front; 90° its right-hand side, as seen from the front), how far down from straight above
 * (90° is level), and the distance (`auto` frames the whole model). The runner's posters and the
 * product features on the websites use the same angles, so a poster and the live model line up
 * (D-056, D-059).
 */
export const MODEL_VIEWS = {
  front: '0deg 75deg auto',
  angle: '45deg 70deg auto',
  left: '-90deg 75deg auto',
  right: '90deg 75deg auto',
  top: '0deg 15deg auto',
  back: '180deg 75deg auto',
} as const;
export type ModelView = keyof typeof MODEL_VIEWS;
export const MODEL_VIEW_NAMES = Object.keys(MODEL_VIEWS) as [ModelView, ...ModelView[]];
