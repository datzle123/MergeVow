import type { AnySchemaObject } from "ajv";
import schemaDocument from "../schema/contract-v1.schema.json" with { type: "json" };

export const CONTRACT_V1_SCHEMA_ID = schemaDocument.$id;

export const contractV1Schema: AnySchemaObject = schemaDocument;
