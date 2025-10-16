import { RelationType } from '../enums/relation-type.enum';

export interface ListItemModel {
  id: string;
  relationType: RelationType;
  label: string;
  columnNames?: string[];
}
