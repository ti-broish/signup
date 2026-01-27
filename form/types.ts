
export enum WidgetType {
  SIGNUP = 'signup',
}

export interface WidgetMetadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultHeight: string;
  defaultWidth: string;
}
