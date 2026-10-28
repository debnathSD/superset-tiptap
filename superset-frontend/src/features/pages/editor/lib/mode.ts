import { createContext, useContext } from 'react'

/** Edit vs. view mode, readable from node views (they render inside EditorContent's React tree). */
export const EditableContext = createContext(true)

export const useEditable = () => useContext(EditableContext)
