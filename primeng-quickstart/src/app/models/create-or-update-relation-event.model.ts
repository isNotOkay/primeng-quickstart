import { RelationType } from '../enums/relation-type.enum';

export interface CreateOrUpdateRelationEventModel {
  relationType: RelationType;
  name: string;
  created: boolean;
}
