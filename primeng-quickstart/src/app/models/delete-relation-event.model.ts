import { RelationType } from '../enums/relation-type.enum';

export interface DeleteRelationEventModel {
  relationType: RelationType;
  name: string;
}
