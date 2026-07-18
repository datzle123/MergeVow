export const CONTRACT_LIMITS = {
  maxBytes: 64 * 1024,
  maxDepth: 8,
  maxNodes: 2048,
  minSteps: 1,
  maxSteps: 100,
  maxFlowLength: 64,
  maxUrlLength: 2048,
  maxLocatorTextLength: 512,
  maxValueLength: 4096,
} as const;
