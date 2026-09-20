export default function Footer() {
  return (
    <footer className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 pt-4 pb-4 px-4 text-center transition-colors">
      <p className="text-xs text-gray-400 dark:text-slate-400">
        Data sourced from{' '}
        <a
          href="https://nyhl.on.ca/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-nyhl-blue hover:underline"
        >
          North York Hockey League
        </a>
      </p>
      <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
        Powered by{' '}
        <a
          href="http://www.agilex.ca/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-nyhl-blue hover:underline"
        >
          AGILEX
        </a>
      </p>
      <p className="text-xs text-gray-300 dark:text-slate-600 mt-1">
        Not affiliated with NYHL. Built for fans, by fans.
      </p>
    </footer>
  )
}
