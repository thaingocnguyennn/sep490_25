import { outgoingDocumentsRepository } from './src/modules/outgoing-documents/outgoing-documents.repository';

async function test() {
  try {
    const res = await outgoingDocumentsRepository.findAll({ page: 1, limit: 10, search: 'test' });
    console.log("Success:", res);
  } catch (e) {
    console.error("Error with search:", e);
  }
}

test().catch(console.error);
