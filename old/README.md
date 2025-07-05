# SciPair - Author Comparison Tool

SciPair is a tool for exploring relationships between authors using data from OpenAlex. It allows users to compare authors, visualize coauthorships, and citations.

## Link to Try It

You can try the tool online at [https://scipair.github.io/scipair/](https://scipair.github.io/scipair/).

## Creators

- [Danishjeet Singh](https://singhdan.me)
- [Filipi N. Silva](https://filipinascimento.github.io)

## How to Use

1. **Search for Authors**: Enter the names of two authors in the search fields labeled "Author A" and "Author B".
2. **View Author Information**: The tool will display information about the selected authors, including their names, institutions, and IDs.
3. **Explore Works**: The tool will fetch and display the works of the selected authors. You can click on the works to view more details.
4. **Highlight Relationships**: The tool will highlight relationships between the authors' works, such as coauthorships, citations, and references.
5. **Toggle Visibility**: Use the "Show all papers" and "Hide other papers" buttons to toggle the visibility of non-highlighted papers.

## External Libraries

SciPair uses the following external libraries:

- **Axios**: For making HTTP requests to the OpenAlex API.
- **Bulma**: For styling the user interface.

## How to Run

To run the project, you can use a Python internal HTTP server. Follow these steps:

1. Open a terminal or command prompt.
2. Navigate to the directory containing the `index.html` file.
3. Run the following command to start the server:
   ```sh
   python -m http.server
   ```
4. Open a web browser and go to `http://localhost:8000` to view the project.

## Type of Language

The project uses the following languages:

- **HTML**: For structuring the web page.
- **CSS**: For styling the web page.
- **JavaScript**: For adding interactivity and handling data fetching.

## Potential Usages

SciPair is useful for researchers, academics, and anyone interested in exploring author relationships and their works. It can help users:

- Discover coauthorships and collaborations between authors.
- Identify citation patterns and references between works.
- Gain insights into the research output and impact of authors.
- Explore the academic network and connections of authors.

## Extended Description

SciPair provides a user-friendly interface to explore relationships between authors using data from OpenAlex. The tool allows users to:

- **Search for Authors**: Enter the names of two authors to compare. The tool provides autocomplete suggestions to help users find the correct authors.
- **View Author Information**: The tool displays information about the selected authors, including their names, institutions, and IDs.
- **Explore Works**: The tool fetches and displays the works of the selected authors. Users can click on the works to view more details, such as the title, publication year, venue, and URL.
- **Highlight Relationships**: The tool highlights relationships between the authors' works, such as coauthorships, citations, and references. Different colors and symbols are used to indicate the type of relationship.
- **Toggle Visibility**: Users can toggle the visibility of non-highlighted papers using the "Show all papers" and "Hide other papers" buttons. This helps users focus on the most relevant works and relationships.

The tool uses external libraries such as Axios for making HTTP requests to the OpenAlex API and Bulma for styling the user interface. The project is built using HTML, CSS, and JavaScript, making it easy to run and modify.
