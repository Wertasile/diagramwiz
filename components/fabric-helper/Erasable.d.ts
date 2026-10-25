import 'fabric'

// @erase2d/fabric 1.2.x reads/writes `erasable` on objects but does not ship the
// type augmentation, so declare it here. Put this file anywhere tsconfig includes
// (e.g. /types/erasable.d.ts).
declare module 'fabric' {
  interface FabricObjectProps {
    /**
     * true   -> the eraser cuts this object
     * 'deep' -> groups only: the eraser cuts each child separately
     * false / undefined -> the eraser ignores this object
     */
    erasable?: boolean | 'deep'
  }
  interface SerializedObjectProps {
    erasable?: boolean | 'deep'
  }
  interface FabricObject {
    erasable?: boolean | 'deep'
  }
}