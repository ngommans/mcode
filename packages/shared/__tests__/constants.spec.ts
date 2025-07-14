import { describe, it, expect } from 'vitest';
import * as constants from '../src/constants/index.js';

describe('shared constants snapshot', () => {
  it('exports match snapshot', () => {
    expect(constants).toMatchSnapshot();
  });
});
