import React from 'react'
import { motion } from 'framer-motion'

type ActStubProps = {
  title: string
  hint: string
  onContinue: () => void
}

export function ActStub({ title, hint, onContinue }: ActStubProps): JSX.Element {
  return (
    <div className="nomi-ob__hero">
      <motion.div
        className="nomi-ob__orb"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
      />

      <motion.h1
        className="nomi-ob__title"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        {title}
      </motion.h1>

      <motion.p
        className="nomi-ob__sub"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, delay: 0.25 }}
      >
        {hint}
      </motion.p>

      <motion.button
        className="nomi-ob__cta"
        onClick={onContinue}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.45 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
      >
        下一步 →
      </motion.button>
    </div>
  )
}
