# SciPair React App

This is a React version of the SciPair author comparison tool, converted from the original HTML/JavaScript implementation.

## About

SciPair is a tool to explore relationships between authors using data from OpenAlex. It allows users to compare authors, visualize coauthorships and citations between their works.

**Created by:**
- [Danishjeet Singh](https://singhdan.me)
- [Filipi N. Silva](https://filipinascimento.github.io)

## Features

- **Author Search**: Search for authors with autocomplete functionality
- **Author Comparison**: Compare two authors side by side
- **Citation Analysis**: Visualize citing relationships between authors' works
- **Coauthorship Detection**: Highlight papers that are coauthored
- **Interactive Filtering**: Toggle between showing all papers or just highlighted ones
- **Statistics**: View counts of citations, coauthorships, and total works
- **Direct Links**: Click on papers to view them directly

## Technology Stack

- **React**: Frontend framework
- **Axios**: HTTP client for API requests
- **Bulma CSS**: CSS framework for styling
- **OpenAlex API**: Data source for academic papers and authors

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

### Running the App

```bash
npm start
```

The app will open in your browser at `http://localhost:3000`.

### Building for Production

```bash
npm run build
```

This creates a `build` folder with the production-optimized files.

## Usage

1. Enter author names in the search fields (Author A and Author B)
2. Select authors from the autocomplete dropdown
3. Wait for the app to load all their works
4. View the highlighted relationships:
   - **Blue (↑)**: Papers where Author A cites Author B
   - **Orange (↓)**: Papers where Author A is cited by Author B
   - **Pink (○)**: Papers coauthored by both authors
5. Use the toggle buttons to show/hide non-highlighted papers
6. Click on any paper to view it directly

## API

This app uses the [OpenAlex API](https://openalex.org/) to fetch author and publication data. No API key is required.

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is open source. See the [GitHub repository](https://github.com/scipair/scipair) for more details.

## Conversion Notes

This React version maintains all the functionality of the original HTML/JavaScript version while providing:
- Better component organization
- React state management
- Improved maintainability
- Modern development workflow
