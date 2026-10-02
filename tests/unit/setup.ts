import { Sim } from '../../src/game';

// Every unit test runs the sim strict: an unknown secret ID throws instead
// of quietly finding nothing (P-27 of the pre-release review).
Sim.strict = true;
