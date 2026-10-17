#[tokio::main]
async fn main() {
    let exit_code = mist_cli::cli::run_cli().await;
    std::process::exit(exit_code);
}
