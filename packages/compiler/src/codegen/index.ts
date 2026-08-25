export {
  OpCode,
  Chunk,
  disassembleChunk,
  disassembleInstruction,
} from './chunk.js';

export {
  BytecodeCompiler,
  type Local,
  type UpvalueDesc,
  type FunctionType,
} from './compiler.js';
